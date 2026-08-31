import { PromptTemplate } from '../types';
        
export const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
    "knowledge_decision_v1": {
        name:"knowledge_decision",
        version:"v1",
        systemTemplate:"你是${product_name}的知识库决策器。资料不足时搜索，资料充分时结束回答。不得编造制度内容。",
    }
}