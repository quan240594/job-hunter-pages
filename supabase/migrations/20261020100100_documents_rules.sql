-- Documents: server-side expiry and the 3-templates-per-user cap (docs/CONTRACT.md, sections 2 and 5).
--  * expires_at is always derived: created_at + 6 months for cv/letter, NULL for template. Client values are ignored.
--  * End users (auth.uid() is not null) cannot choose or change created_at, so the expiry cannot be postponed.
--  * The 4th template of a user is rejected with the exception message 'template_limit' (SQLSTATE P0001).

create or replace function public.documents_enforce_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  template_count integer;
  becomes_template boolean;
begin
  if auth.uid() is not null then
    new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  end if;

  new.expires_at := case
    when new.kind = 'template' then null
    else ((new.created_at at time zone 'UTC') + interval '6 months') at time zone 'UTC'
  end;

  becomes_template := new.kind = 'template'
    and (tg_op = 'INSERT' or old.kind is distinct from 'template' or old.user_id is distinct from new.user_id);

  if becomes_template then
    -- Serialise concurrent template inserts of the same user so the count below cannot race.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    select count(*) into template_count
      from public.documents d
      where d.user_id = new.user_id and d.kind = 'template' and d.id <> new.id;
    if template_count >= 3 then
      raise exception 'template_limit'
        using errcode = 'P0001', detail = 'A user can keep at most 3 template documents.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists documents_enforce_rules on public.documents;
create trigger documents_enforce_rules
  before insert or update on public.documents
  for each row execute function public.documents_enforce_rules();
