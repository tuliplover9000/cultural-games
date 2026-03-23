/**
 * email-capture.js — Footer email signup + exit-intent modal (Phase F).
 *
 * SETUP REQUIRED IN SUPABASE (run once):
 *   CREATE TABLE email_signups (
 *     id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     email      text NOT NULL,
 *     source     text DEFAULT 'footer',
 *     created_at timestamptz DEFAULT now(),
 *     CONSTRAINT email_signups_email_unique UNIQUE (email),
 *     CONSTRAINT email_signups_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
 *   );
 *   ALTER TABLE email_signups ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "anyone can subscribe" ON email_signups FOR INSERT WITH CHECK (true);
 */
(function () {
  'use strict';

  var SB_URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  function getSB() {
    if (!window.supabase) return null;
    return window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  // ── Core submit function ────────────────────────────────────────────────────
  async function submitEmailSignup(email, source, onSuccess, onError) {
    source = source || 'footer';
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      if (onError) onError('Please enter a valid email address.');
      return;
    }
    var sb = getSB();
    if (!sb) { if (onError) onError('Something went wrong. Please try again.'); return; }
    try {
      var result = await sb.from('email_signups').insert({
        email: email.toLowerCase().trim(),
        source: source,
      });
      // Duplicate email — treat as success (don't reveal)
      if (result.error && result.error.code === '23505') { if (onSuccess) onSuccess(); return; }
      if (result.error) throw result.error;
      if (onSuccess) onSuccess();
    } catch (e) {
      if (onError) onError('Something went wrong. Please try again.');
    }
  }

  // ── Footer signup ───────────────────────────────────────────────────────────
  function initFooter(prefix) {
    prefix = prefix || '';
    var input   = document.getElementById(prefix + 'ec-email-input');
    var btn     = document.getElementById(prefix + 'ec-submit-btn');
    var success = document.getElementById(prefix + 'ec-success');
    var errEl   = document.getElementById(prefix + 'ec-error');
    if (!input || !btn) return;

    btn.addEventListener('click', function () {
      if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
      btn.disabled = true;
      btn.textContent = 'Saving\u2026';
      submitEmailSignup(
        input.value.trim(),
        'footer',
        function () {
          if (success) success.hidden = false;
          if (input.closest('.ec-footer-signup__form')) {
            input.closest('.ec-footer-signup__form').hidden = true;
          }
          if (errEl) errEl.hidden = true;
        },
        function (msg) {
          btn.disabled = false;
          btn.textContent = 'Notify me';
          if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        }
      );
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') btn.click();
    });
  }

  // ── Exit intent ─────────────────────────────────────────────────────────────
  function initExitIntent() {
    if (sessionStorage.getItem('ec-exit-shown')) return;
    if (window.innerWidth < 768) return;

    var triggered = false;
    document.addEventListener('mouseleave', function handler(e) {
      if (triggered || e.clientY > 20) return;
      triggered = true;
      document.removeEventListener('mouseleave', handler);
      sessionStorage.setItem('ec-exit-shown', '1');
      showExitModal();
    });
  }

  function showExitModal() {
    var backdrop = document.getElementById('ec-exit-modal-backdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    var emailInput = document.getElementById('ec-exit-email');
    if (emailInput) emailInput.focus();
  }

  function hideExitModal() {
    var backdrop = document.getElementById('ec-exit-modal-backdrop');
    if (backdrop) backdrop.hidden = true;
  }

  function initExitModalControls() {
    var closeBtn  = document.getElementById('ec-modal-close');
    var skipBtn   = document.getElementById('ec-modal-skip');
    var submitBtn = document.getElementById('ec-exit-submit');
    var emailInput= document.getElementById('ec-exit-email');
    var successEl = document.getElementById('ec-exit-success');
    var errEl     = document.getElementById('ec-exit-error');

    if (closeBtn) closeBtn.addEventListener('click', hideExitModal);
    if (skipBtn)  skipBtn.addEventListener('click',  hideExitModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideExitModal();
    });

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving\u2026';
        submitEmailSignup(
          emailInput ? emailInput.value.trim() : '',
          'exit_intent',
          function () {
            if (successEl) { successEl.hidden = false; }
            if (emailInput) emailInput.closest('.ec-modal__form').style.display = 'none';
            submitBtn.textContent = 'Notify me';
            setTimeout(hideExitModal, 1800);
          },
          function (msg) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Notify me';
            if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
          }
        );
      });
    }

    if (emailInput) {
      emailInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && submitBtn) submitBtn.click();
      });
    }
  }

  // ── Init on DOM ready ───────────────────────────────────────────────────────
  function boot() {
    initFooter('');
    initExitModalControls();
    initExitIntent();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.EmailCapture = { submit: submitEmailSignup };
}());
