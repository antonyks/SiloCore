export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthPersonalWorkspace {
  id: number;
  name: string;
  type: 'PERSONAL';
  status: 'ACTIVE';
}
