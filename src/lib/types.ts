export type Role = "client" | "admin" | "va";
export type AccountStatus = "active" | "inactive";

export interface Profile {
  id: string;
  role: Role;
  name: string | null;
  email: string | null;
  onboarding_complete: boolean | null;
  linked_user_id: string | null;
  account_status: AccountStatus | null;
  created_at: string;
}
