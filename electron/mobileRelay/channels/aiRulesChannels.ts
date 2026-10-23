import { registerChannel } from '../dispatch'
import { DEFAULT_AI_RULES_LISTS, getAiRules, setAiRules, type AiRules } from '../../aiRules'

export function registerAiRulesRelayChannels(): void {
  registerChannel('aiRules:get', () => getAiRules())
  registerChannel('aiRules:set', (rules: AiRules) => setAiRules(rules))
  registerChannel('aiRules:getDefaults', () => DEFAULT_AI_RULES_LISTS)
}
