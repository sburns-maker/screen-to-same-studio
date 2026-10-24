-- Apply after 0034. Keep the existing retry recovery and authorization safeguards.
-- Lovable's change makes the daily limit effectively unlimited (2,147,483,647).
-- Deliberately modify ONLY the daily count threshold; do not replace 0034.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) INTO definition;
 IF position('>=2147483647 AND o.id IS NULL' in definition)>0 THEN RETURN; END IF;
 IF position('>=160 AND o.id IS NULL' in definition)=0 THEN
  RAISE EXCEPTION 'Unexpected experience_command version; daily limit update aborted safely';
 END IF;
 definition:=replace(definition,'>=160 AND o.id IS NULL','>=2147483647 AND o.id IS NULL');
 EXECUTE definition;
END $$;
