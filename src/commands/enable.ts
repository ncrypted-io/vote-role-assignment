import bld = require('@discordjs/builders')
import type { CommandInteraction, CacheType } from 'discord.js'

import Managers from '../db/managers'
import { ReportableError } from '../db/managers/manUtils'

import { SettingsData } from '../db/dbTypes'
import { convertToDbType } from './commUtils'

export const enableCommand = new bld.SlashCommandBuilder()
  .setName('enable')
  .setDescription('Initialize the bot in this channel/thread.')
  .addRoleOption((option) =>
    option.setName('awarded-role')
      .setDescription('Awarded role')
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option.setName('voting-threshold')
      .setDescription('How many votes required to award the role')
      .setRequired(true)
  )
  .addRoleOption((option) =>
    option.setName('allowed-to-vote-role1')
      .setDescription('If set, will allow only this role to vote')
      .setRequired(false)
  )
  .addRoleOption((option) =>
    option.setName('allowed-to-vote-role2')
      .setDescription('If set, will allow only this role to vote')
      .setRequired(false)
  )

export const enableCommandHandler = async (managers: Managers, interaction: CommandInteraction<CacheType>) => {
  try {
    const dbType = convertToDbType({
      optionsData: interaction.options.data,
      group: [{ toKey: 'allowed_to_vote_roles', fromKeys: ['allowed-to-vote-role1', 'allowed-to-vote-role2'] }],
    })
    const res = await managers.settings.create(interaction.channelId, dbType as unknown as SettingsData)
    await interaction.reply({ content: res.inserted ? 'Enabled' : 'Updated', ephemeral: true })
  } catch (e: unknown) {
    if (e instanceof ReportableError) {
      await interaction.reply({ content: e.message, ephemeral: true })
    } else {
      console.log(e)
    }
  }
}
