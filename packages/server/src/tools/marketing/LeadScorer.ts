export class LeadScorer {
  static async scoreLead(lead: {
    email: string;
    companyData?: any;
    engagement: {
      pageViews: number;
      emailOpens: number;
    };
    customFields: Record<string, any>;
  }, scoringModel: 'default' | 'custom' = 'default') {
    // Base scoring
    let score = 0;
    
    // Email validation
    const emailScore = this.scoreEmail(lead.email);
    score += emailScore * 0.3;
    
    // Engagement scoring
    const engagementScore = Math.min(
      Math.log(lead.engagement.pageViews + 1) * 10 +
      lead.engagement.emailOpens * 2,
      50
    );
    score += engagementScore * 0.5;
    
    // Custom model integration
    if (scoringModel === 'custom') {
      score += await this.applyCustomModel(lead);
    }
    
    return Math.min(Math.round(score), 100);
  }

  private static scoreEmail(email: string): number {
    const [local, domain] = email.split('@');
    
    // Penalize free email providers
    const freeDomains = ['gmail.com', 'yahoo.com', 'outlook.com'];
    if (freeDomains.includes(domain)) return 50;
    
    // Score based on domain age (would query WHOIS in production)
    return 80;
  }
}