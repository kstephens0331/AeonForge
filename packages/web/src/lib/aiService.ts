import { TogetherAI } from 'togetherai';

export class AeonAI {
  private aiClient: TogetherAI;
  private model: string = 'togethercomputer/llama-2-70b-chat';
  private fallbackModels: string[] = [
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO'
  ];

  constructor(apiKey: string) {
    this.aiClient = new TogetherAI({ apiKey });
  }

  async processMessage(context: string, attempt = 0): Promise<string> {
    try {
      const currentModel = attempt === 0 ? this.model : this.fallbackModels[attempt - 1];
      
      const response = await this.aiClient.complete({
        prompt: context,
        model: currentModel,
        max_tokens: 2000,
        temperature: 0.7,
        stop: ['\nUser:', '\nAI:']
      });
      
      return response.choices[0].text.trim();
    } catch (error) {
      if (attempt < this.fallbackModels.length) {
        return this.processMessage(context, attempt + 1);
      }
      throw new Error('All AI models failed to respond');
    }
  }
}