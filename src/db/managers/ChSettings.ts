import { PoolClient } from 'pg'

import pool from '../pool'
import { ChSettingsData, ChSetting } from '../dbTypes'
import { ReportableError } from './manUtils'
import Submissions from './Submissions'

type InsSetting = ChSetting & { inserted: boolean }

type SettDataKey = keyof ChSettingsData

const modifyArrVals = (oldChSettData: ChSettingsData, newChSettData: Partial<ChSettingsData>, isDel = false) => {
  return (Array.from(new Set([...Object.keys(oldChSettData), ...Object.keys(newChSettData)])) as (SettDataKey)[])
    .reduce<ChSettingsData>(<K extends SettDataKey>(acc: ChSettingsData, key: K) => {
      const newVal = newChSettData[key]
      const oldVal = acc[key]
      if (newVal && Array.isArray(newVal)) {
        if (!isDel) {
          acc[key] = Array.from(new Set([...(oldVal ?? [] as any), ...newVal])) as ChSettingsData[typeof key]
        } else {
          acc[key] = (oldVal ?? [] as any).filter((vl: any) => !newVal.includes(vl)) as ChSettingsData[typeof key]
        }
      }
      return acc
    }, { ...oldChSettData })
}

class ChSettings {
  documents = new Submissions()

  async getByChId(channelId: string): Promise<ChSetting | undefined> {
    const { rows } = await pool.query<ChSetting>(`
      SELECT sts."data"
      FROM channel_settings sts
      WHERE sts."channel_id" = $1 AND sts."is_disabled" = FALSE
    `, [channelId])
    return rows[0]
  }

  async upsert(channelId: string, data: ChSettingsData): Promise<InsSetting | undefined> {
    try {
      const { rows } = await pool.query<InsSetting>(`
        INSERT INTO channel_settings ("channel_id", "data") VALUES ($1, $2)
        ON CONFLICT ("channel_id") DO UPDATE SET "data" = EXCLUDED.data, "is_disabled" = FALSE
        RETURNING *, (xmax = 0) inserted
      `, [channelId, data])
      return rows[0]
    } catch (e: unknown) {
      console.log(e)
      throw new ReportableError('Failed to save settings')
    }
  }

  private async updateChIdByChId(channelId: string, newChannelId: string, client?: PoolClient): Promise<ChSetting | undefined> { // TODO Turn into patch and merge with `updateAnySettingsFieldByChId`
    const { rows: [row] } = await (client ?? pool).query<ChSetting>(`
      UPDATE channel_settings sts SET "channel_id" = $2
      WHERE sts."channel_id" = $1 AND sts."is_disabled" = FALSE
      RETURNING *
    `, [channelId, newChannelId])
    return row
  }

  async mergeOneChSettingsIntoAnotherByChId(fromChId: string, intoChId: string): Promise<ChSetting | undefined> {
    const client = await pool.connect()
    let res: ChSetting | undefined
    try {
      await client.query('BEGIN')
      const { rows: [newChSett] } = await client.query<ChSetting>(`
        SELECT * FROM channel_settings cs WHERE cs."channel_id" = $1 FOR UPDATE
      `, [intoChId])
      if (newChSett) {
        await this.documents.updateManyChSettIdByChId(fromChId, newChSett.id, client)
        await client.query('SAVEPOINT last')
        await this.deleteByChId(fromChId, client, 'last')
        res = await this.getByChId(intoChId)
      } else {
        res = await this.updateChIdByChId(fromChId, intoChId, client)
      }
      await client.query('COMMIT')
      return res
    } catch (e: unknown) {
      console.log(e)
      await client.query('ROLLBACK')
    }
  }

  async deleteByChId(channelId: string, client?: PoolClient, savepoint?: string): Promise<string | undefined> {
    try {
      const { rows: [row] } = await (client ?? pool).query<Pick<ChSetting, 'id'>>(`
        DELETE FROM channel_settings sts WHERE sts."channel_id" = $1 RETURNING "id"
      `, [channelId])
      return row?.id
    } catch (e: unknown) {
      if (client && savepoint) {
        await client.query(`ROLLBACK TO ${savepoint}`)
      }
      const { rows: [row] } = await (client ?? pool).query<Pick<ChSetting, 'id'>>(`
        UPDATE channel_settings sts SET "is_disabled" = TRUE
        WHERE sts."channel_id" = $1 RETURNING "id"
      `, [channelId])
      return row?.id
    }
  }

  async patchDataByChId(channelId: string, data: Partial<ChSettingsData>, client?: PoolClient): Promise<ChSetting | undefined> {
    const { rows } = await pool.query<ChSetting>(`
      UPDATE channel_settings sts SET "data" = (
        SELECT "data" FROM channel_settings sts1 WHERE sts1."channel_id" = $1
      ) || $2
      WHERE sts."channel_id" = $1 AND sts."is_disabled" = FALSE
      RETURNING *
    `, [channelId, data])
    return rows[0]
  }

  async patchDataArrayFields(channelId: string, data: Partial<ChSettingsData>, isDel = false): Promise<ChSetting | undefined> {
    const client = await pool.connect()
    await client.query('BEGIN')
    const { rows: [oldChSett] } = await client.query<ChSetting>(`
      SELECT "data" FROM channel_settings cs WHERE cs."channel_id" = $1 FOR UPDATE
    `, [channelId])
    if (oldChSett?.data) {
      const mergedData = modifyArrVals(oldChSett?.data, data, isDel)
      const chSettNew = this.patchDataByChId(channelId, mergedData, client)
      await client.query('COMMIT')
      return chSettNew
    }
  }
}

export default ChSettings
