import type { LayoutColumnConfig } from './permission.entity';

export class PermissionHelper {
  static buildVisibleColumns(): LayoutColumnConfig[] {
    return [
      { field: 'mrn',       label: 'MRN',        visible: true },
      { field: 'lastName',  label: 'Last Name',   visible: true },
      { field: 'firstName', label: 'First Name',  visible: true },
      { field: 'status',    label: 'Status',      visible: true },
      { field: 'ward',      label: 'Ward',        visible: true },
    ];
  }

  static buildActionBar(capabilities: string[]): string[] {
    const bar: string[] = [];
    if (capabilities.includes('editPatientStatus')) bar.push('editStatus');
    return bar;
  }
}
