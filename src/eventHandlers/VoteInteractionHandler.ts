import dsc = require('discord.js')

import client from '../client'
import { ChSettingsData } from '../db/dbTypes'
import Managers from '../db/managers'
import { genButton, InnerMessage, fetchMember } from './handlUtils'

const changeButtonCount = (actionRow: dsc.MessageActionRow, newCount: number, type: 'like' | 'dislike'): void => {
  const index = type === 'like' ? 0 : 1
  const oldButton = actionRow.components.at(index)
  if (oldButton?.type === 'BUTTON') {
    actionRow.spliceComponents(index, 1, genButton(type, newCount))
  }
}

class VoteInteractionHandler {
  private type: 'like' | 'dislike'

  constructor(private chConfig: ChSettingsData, private interaction: dsc.ButtonInteraction<dsc.CacheType>, private managers: Managers) {  // eslint-disable-line @typescript-eslint/no-parameter-properties
    this.type = this.interaction.customId as 'like' | 'dislike'
  }

  private canVote = async (): Promise<boolean | undefined> => {
    const { allowed_to_vote_roles } = this.chConfig
    if (allowed_to_vote_roles && allowed_to_vote_roles.length > 0) {
      const member = await fetchMember(this.interaction.guildId, this.interaction.user.id)
      return member?.roles.cache.some((r) => allowed_to_vote_roles.includes(r.id))
    }
    return true
  }

  private assignRole = async (count: number, innMessage: InnerMessage): Promise<void> => {
    if (count >= this.chConfig.voting_threshold) {
      const guild = await client.guilds.fetch(this.interaction.guildId)
      const id = innMessage.authorId
      const member = guild.members.cache.get(id)

      if (this.interaction.message.type === 'REPLY' && this.interaction.message.pinned) {
        await this.interaction.message.unpin()
      }
      if (member) {
        const link = innMessage.url
        if (link) {
          await this.managers.documents.insert({
            author_id: member.id, author_tag: member.user.tag, link, ch_sett_id: this.interaction.channelId,
          })
        }
        await member.roles.add(this.chConfig.awarded_role)
      }
    }
  }

  process = async (): Promise<{ messageContent: string, actionRow: dsc.MessageActionRow } | null> => {
    // let role = guild.roles.cache.find(r => console.log(r.id, r.name))
    const isAllowedToVote = await this.canVote()

    if (!isAllowedToVote) return null

    const { message: msg, user } = this.interaction
    const message = msg as dsc.Message<boolean>
    const actionRow = message.components.at(0)

    if (actionRow?.type === 'ACTION_ROW') {
      await this.managers.votes.processVote({
        message_id: msg.id,
        user_id: user.id,
        user_tag: user.tag,
        in_favor: this.type === 'like',
      })
      const votes = await this.managers.votes.getVoteCountsByMessageId(msg.id)
      const innMessage = InnerMessage.from({
        oldMessage: message.content, inFavor: votes?.in_favor, against: votes?.against,
      })
      if (innMessage) {
        changeButtonCount(actionRow, votes?.in_favor_count ?? 0, 'like')
        changeButtonCount(actionRow, votes?.against_count ?? 0, 'dislike')

        if (this.type === 'like') {
          await this.assignRole(votes?.in_favor_count ?? 0, innMessage)
        }

        return { messageContent: innMessage.toString(), actionRow }
      }
    }
    return null
  }
}

export default VoteInteractionHandler