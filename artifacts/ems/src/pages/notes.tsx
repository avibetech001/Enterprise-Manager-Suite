import { DashboardNote } from "@/components/dashboard-note";
import { SharedNotesList } from "@/components/shared-notes-list";

export default function NotesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-3 sm:p-5 md:p-8">
      <DashboardNote allNotesVisible />
      <SharedNotesList />
    </div>
  );
}
