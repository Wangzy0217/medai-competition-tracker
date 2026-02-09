export enum Status {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  WARNING = 'WARNING',
  REVIEWING = 'REVIEWING',
  COMPLETED = 'COMPLETED',
  RISK = 'RISK',
}

export interface SubTask {
  id: string;
  description: string;
  owner: string;
  deadline: string;
  status: Status;
  canWithdrawReview?: boolean;
}

export interface MainTask {
  id: string;
  title: string;
  dateRange: string;
  subTasks: SubTask[];
}

export interface Phase {
  id: string;
  title: string;
  dateRange: string;
  mainTasks: MainTask[];
}

export interface ProjectData {
  phases: Phase[];
}
