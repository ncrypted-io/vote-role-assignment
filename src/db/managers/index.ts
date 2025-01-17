import ChSettings from './ChSettings'
import Submissions from './Submissions'
import Votes from './Votes'

export default class Managers {
  settings: ChSettings = new ChSettings()
  documents: Submissions = new Submissions()
  votes: Votes = new Votes()
}
