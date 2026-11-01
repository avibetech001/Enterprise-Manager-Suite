import { DashboardNote } from "@/components/dashboard-note";

export default function NotesPage() {
  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-5 md:p-8">
      <DashboardNote allNotesVisible />
    </div>
  );
}
