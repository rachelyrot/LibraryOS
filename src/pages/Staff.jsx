import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users, HeartHandshake, Briefcase, CalendarDays, FileText, Clock, ClipboardCheck, ShieldCheck, Sparkles } from 'lucide-react';
import ServiceContractsTab from '@/components/staff/ServiceContractsTab';
import BranchesTab from '@/components/staff/BranchesTab';
import EmployeesTab from '@/components/staff/EmployeesTab';
import VolunteersTab from '@/components/staff/VolunteersTab';
import PositionsTab from '@/components/staff/PositionsTab';
import ScheduleTab from '@/components/staff/ScheduleTab';
import ReportsTab from '@/components/staff/ReportsTab';
import TodayView from '@/components/staff/TodayView';
import AttendanceTab from '@/components/staff/AttendanceTab';
import { canViewStaffReports, visibleBranchIds, canViewEmployee } from '@/lib/permissions';

const VALID_TABS = ['today', 'branches', 'employees', 'volunteers', 'positions', 'schedule', 'attendance', 'security', 'cleaning', 'reports'];

export default function Staff() {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [activeTab, setActiveTab] = useState(VALID_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'today');

  const loadBranches = () => base44.entities.Branch.list('name', 500).then(setBranches).catch(() => {});
  // Lifted here (not fetched separately per-tab) so every tab shares one up-to-date
  // employees list — Radix Tabs keeps inactive tab panels mounted rather than
  // unmounting them, so a tab that fetched its own copy once would never see an
  // employee added from a sibling tab without a full page reload.
  const loadEmployees = () => base44.entities.Employee.list('-created_date', 500).then(setEmployees).catch(() => {});
  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadBranches();
    loadEmployees();
  }, []);

  const canViewReports = canViewStaffReports(user);

  // Branch scoping (migration 0010): מנהלת במקום sees her own branch only.
  // Applied once here rather than in each tab — every tab takes `branches` and
  // `employees` as props and builds its filters, dropdowns and per-branch cards
  // from them, so narrowing the two lists narrows all eight tabs consistently.
  // `null` from visibleBranchIds means "all branches" (admin, מזכירה).
  const allowedBranchIds = visibleBranchIds(user);
  const scoped = allowedBranchIds === null;

  const visibleBranches = useMemo(
    () => (scoped ? branches : branches.filter(b => allowedBranchIds.includes(b.id))),
    [branches, scoped, allowedBranchIds],
  );
  const visibleEmployees = useMemo(
    () => (scoped ? employees : employees.filter(e => canViewEmployee(user, e))),
    [employees, scoped, user],
  );

  // A local_manager with no branch assigned yet sees nothing — visibleBranchIds
  // fails closed on purpose. Say so, rather than showing an empty screen that
  // looks like missing data.
  const missingBranch = !scoped && allowedBranchIds.length === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">כוח אדם</h1>
        <p className="text-muted-foreground mt-1">
          {scoped
            ? 'ניהול סניפים, עובדות, מתנדבות, תקנים, מערכת שעות, נוכחות, אבטחה, ניקיון ודוחות'
            : `הנתונים מוצגים עבור הסניף שלך${user?.branch_name ? ` — ${user.branch_name}` : ''}`}
        </p>
      </div>

      {missingBranch && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          לא שויך לך סניף עדיין, ולכן אין נתוני כוח אדם להצגה. פני למנהלת המערכת כדי לשייך אותך לסניף.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className={`grid grid-cols-5 ${canViewReports ? 'lg:grid-cols-10' : 'lg:grid-cols-9'} gap-1 h-auto`}>
          <TabsTrigger value="today" className="flex items-center gap-1.5 py-2.5"><Clock className="w-4 h-4" /><span className="hidden lg:inline">היום</span></TabsTrigger>
          <TabsTrigger value="branches" className="flex items-center gap-1.5 py-2.5"><Building2 className="w-4 h-4" /><span className="hidden lg:inline">סניפים</span></TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-1.5 py-2.5"><Users className="w-4 h-4" /><span className="hidden lg:inline">עובדות</span></TabsTrigger>
          <TabsTrigger value="volunteers" className="flex items-center gap-1.5 py-2.5"><HeartHandshake className="w-4 h-4" /><span className="hidden lg:inline">מתנדבות</span></TabsTrigger>
          <TabsTrigger value="positions" className="flex items-center gap-1.5 py-2.5"><Briefcase className="w-4 h-4" /><span className="hidden lg:inline">תקנים</span></TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-1.5 py-2.5"><CalendarDays className="w-4 h-4" /><span className="hidden lg:inline">מערכת שעות</span></TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-1.5 py-2.5"><ClipboardCheck className="w-4 h-4" /><span className="hidden lg:inline">נוכחות</span></TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1.5 py-2.5"><ShieldCheck className="w-4 h-4" /><span className="hidden lg:inline">אבטחה</span></TabsTrigger>
          <TabsTrigger value="cleaning" className="flex items-center gap-1.5 py-2.5"><Sparkles className="w-4 h-4" /><span className="hidden lg:inline">ניקיון</span></TabsTrigger>
          {canViewReports && <TabsTrigger value="reports" className="flex items-center gap-1.5 py-2.5"><FileText className="w-4 h-4" /><span className="hidden lg:inline">דוחות</span></TabsTrigger>}
        </TabsList>

        <TabsContent value="today"><TodayView branches={visibleBranches} employees={visibleEmployees} /></TabsContent>
        <TabsContent value="branches"><BranchesTab user={user} branches={visibleBranches} employees={visibleEmployees} onBranchesChange={loadBranches} /></TabsContent>
        <TabsContent value="employees"><EmployeesTab user={user} branches={visibleBranches} employees={visibleEmployees} onEmployeesChange={loadEmployees} /></TabsContent>
        <TabsContent value="volunteers"><VolunteersTab user={user} branches={visibleBranches} /></TabsContent>
        <TabsContent value="positions"><PositionsTab user={user} branches={visibleBranches} employees={visibleEmployees} /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab user={user} branches={visibleBranches} employees={visibleEmployees} /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab user={user} branches={visibleBranches} employees={visibleEmployees} /></TabsContent>
        <TabsContent value="security"><ServiceContractsTab user={user} branches={visibleBranches} serviceType="security" serviceLabel="אבטחה" icon={ShieldCheck} /></TabsContent>
        <TabsContent value="cleaning"><ServiceContractsTab user={user} branches={visibleBranches} serviceType="cleaning" serviceLabel="ניקיון" icon={Sparkles} /></TabsContent>
        {canViewReports && <TabsContent value="reports"><ReportsTab user={user} branches={visibleBranches} employees={visibleEmployees} /></TabsContent>}
      </Tabs>
    </div>
  );
}