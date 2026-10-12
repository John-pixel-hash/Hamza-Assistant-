-- Migration 0007: tie research notes to projects.
--
-- Phase 6 researches the method before it plans, and the plan cites what the
-- research found. A project id on the research note makes that link real and
-- queryable instead of buried in a tag.

alter table public.research_notes
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists research_notes_project_idx
  on public.research_notes (project_id, created_at desc);
