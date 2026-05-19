export interface RequestContext {
  tenantId: string;
  currentUser: { id: string; email: string; role: string };
  currentRole: string;
}
