import bld = require('@discordjs/builders')
import type { CommandInteraction, CacheType } from 'discord.js'

import { ChSettingsData } from '../../db/dbTypes'
import Managers from '../../db/managers'
import { convertIdToGroupTag } from '../handlUtils'
import { genLinkToDocPage } from './commUtils'

export const infoCommand = new bld.SlashCommandBuilder()
  .setDefaultPermission(false)
  .setName('info')
  .setDescription('Show the settings of this channel/thread.')

const prepareGroupIds = (groupId: string | string[]): string => {
  if (Array.isArray(groupId)) {
    return groupId.map((id) => convertIdToGroupTag(id)).join(', ')
  }
  return convertIdToGroupTag(groupId)
}

const prepareLine = (key: string, val: string) => `  ${key}: ${val}`

const prepareSettingsForDisplay = (obj: ChSettingsData): string => (
  (Object.keys(obj) as (keyof ChSettingsData)[]).map((key) => {
    const normKey = key.replaceAll('_', '-')
    if (key === 'allowed_to_vote_roles' || key === 'awarded_role') {
      return prepareLine(normKey, prepareGroupIds(obj[key] as string | string[]))
    }
    return prepareLine(normKey, JSON.stringify(obj[key]))
  }).join('\n')
)

export const infoCommandHandler = async (managers: Managers, interaction: CommandInteraction<CacheType>): Promise<void> => {
  try {
    const res = await managers.settings.getById(interaction.channelId)
    if (res) {
      await interaction.reply({
        content: `**Settings**:\n${prepareSettingsForDisplay(res.data)}\n**Link**: ${genLinkToDocPage(interaction.channelId)}`,
        ephemeral: true,
      })
    } else {
      await interaction.reply({ content: 'Couldn\'t fetch the data', ephemeral: true })
    }
  } catch (e: unknown) {
    console.log(e)
  }
}