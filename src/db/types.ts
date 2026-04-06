export interface Session {
  id: string;
  campusId: string;
  schoolId: string;
  stuNumber: string;
  token: string;
  phoneNumber?: string;
  sex?: string;
  createdAt: string;
  expiresAt: string;
  expires_at?: string; // 数据库返回的字段名
}

export interface MakeupTask {
  id: string;
  userId: string;
  routeId: string;
  taskId: string;
  customDate: string;
  customPeriod: 'AM' | 'PM';
  mileage: string;
  minTime: string;
  maxTime: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}
