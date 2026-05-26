update public.sacrament_minutes
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      data,
      '{form,speaker1Theme}',
      to_jsonb(coalesce(data #>> '{form,speaker1Theme}', '')),
      true
    ),
    '{form,speaker2Theme}',
    to_jsonb(coalesce(data #>> '{form,speaker2Theme}', '')),
    true
  ),
  '{form,speaker3Theme}',
  to_jsonb(coalesce(data #>> '{form,speaker3Theme}', '')),
  true
)
where data ? 'form'
  and (
    data #> '{form,speaker1Theme}' is null
    or data #> '{form,speaker2Theme}' is null
    or data #> '{form,speaker3Theme}' is null
  );
