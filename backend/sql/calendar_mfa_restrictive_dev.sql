-- Farol Finanças: proteção adicional do calendário no Supabase DEV.
-- Não executar no projeto de produção sem revisão e testes específicos.
-- Preserva as quatro policies de propriedade (user_id = auth.uid()).
-- Esta policy RESTRITIVA impede AAL1 apenas quando o próprio usuário
-- possui um autenticador TOTP verificado; contas sem TOTP continuam em AAL1.

BEGIN;

CREATE SCHEMA IF NOT EXISTS farol_security_private;
REVOKE ALL ON SCHEMA farol_security_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA farol_security_private TO authenticated;

CREATE OR REPLACE FUNCTION farol_security_private.current_user_requires_totp()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_factors AS f
    WHERE f.user_id = auth.uid()
      AND f.status = 'verified'
      AND f.factor_type = 'totp'
  );
$$;

REVOKE ALL ON FUNCTION farol_security_private.current_user_requires_totp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION farol_security_private.current_user_requires_totp() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_events'
      AND policyname = 'calendar_events_verified_totp_aal2'
  ) THEN
    CREATE POLICY calendar_events_verified_totp_aal2
      ON public.calendar_events
      AS RESTRICTIVE
      FOR ALL
      TO authenticated
      USING (
        (SELECT auth.jwt() ->> 'aal') = 'aal2'
        OR NOT (SELECT farol_security_private.current_user_requires_totp())
      )
      WITH CHECK (
        (SELECT auth.jwt() ->> 'aal') = 'aal2'
        OR NOT (SELECT farol_security_private.current_user_requires_totp())
      );
  END IF;
END;
$$;

COMMIT;
