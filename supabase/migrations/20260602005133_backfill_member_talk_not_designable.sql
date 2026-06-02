update public.members
set data = jsonb_set(
  jsonb_set(data, '{sacramentTalkDuration}', to_jsonb('not_designable'::text), true),
  '{canSpeak}',
  'false'::jsonb,
  true
);
