export enum Urgency {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'CRITICAL'
}

export interface TriageData {
  topic: string;
  urgency: Urgency | string;
  suggested_action: string;
  flagged_keywords: string[];
  language: 'ua' | 'en';
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  triage?: TriageData; // Only for model messages
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  currentTriage: TriageData | null;
}