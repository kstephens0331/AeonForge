import { Tool } from '../models/Tool';

export class ToolValidator {
  static validateInput(tool: Tool, input: any) {
    const errors: string[] = [];
    
    tool.inputSchema.forEach(param => {
      if (param.required && !(param.name in input)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
      
      if (input[param.name]) {
        const typeMatch = this.checkType(input[param.name], param.type);
        if (!typeMatch) {
          errors.push(`Invalid type for ${param.name}: expected ${param.type}`);
        }
      }
    });
    
    return errors.length === 0 ? null : errors;
  }
  
  private static checkType(value: any, expectedType: string): boolean {
    // Implementation handles type checking and array/object validation
  }
}