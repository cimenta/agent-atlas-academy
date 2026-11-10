---
title: Privacy policy
---

## Summary

Agent Atlas is an educational website. It uses **no cookies**, no trackers and no analytics, and it loads no third-party scripts, styles or fonts. It has no accounts. If you choose to run your own experiment, your task and your Anthropic key pass through our server to reach Anthropic (see below); nothing is stored on our side.

## Who is responsible

Radek Šimčík (Company ID 06018025). Contact for privacy requests: info@agentatlas.academy.

## What is stored in your browser

Agent Atlas remembers things only locally, in your own browser. Nothing that it remembers is sent to us or stored on our servers. It remembers:

- the language you choose (local storage, key `aa.lang`);
- your settings, such as default run limits (local storage, key `aa.settings`);
- every run you make, in full: the task, the agents and their instructions, every message and every answer of Anthropic as it came back (including search results, the request id, token counts and timings), when the run started and ended, and basic details of your browser (language, time zone, browser identification) (the browser database IndexedDB, database `aa`). Your API key is never part of it;
- only if you choose "Remember on this device", your Anthropic API key, encrypted with a password you set (local storage, key `aa.vault`). The password is not stored anywhere, so it cannot be recovered. If you forget it, you enter the key again.

By default your API key is kept only in the memory of the open tab and is gone when you close or reload it. You can remove everything at any time in Settings (delete all runs, forget key), or by clearing the site data in your browser. You can also export a backup to a file and import it later; the file is yours and never sent to us.

## When you run your own experiment

When you press Run, your task, the agents' instructions and messages, and your API key are sent to our server only so that the request can be forwarded to Anthropic. The server does not store them and does not write them to logs. Anthropic then processes them under its own terms and privacy policy. The cost of the run is billed by Anthropic to your own account. If web search is switched on, search queries are handled by Anthropic as well. Do not put personal or confidential data in a task.

## Hosting logs

The site is hosted by Vercel Inc., a company in the United States. Like any web host, the provider keeps server logs, including IP addresses, for security and operation. We do not have access to a profile of you and do not combine these logs with anything else. Retention period: as set by the hosting provider's own policy. Legal basis: legitimate interest under GDPR Article 6(1)(f), to keep the site secure and running.

## Your rights

Under the GDPR you have the right to access, correct or delete personal data about you, to restrict or object to its processing, and to complain to a supervisory authority: the Czech Office for Personal Data Protection (Úřad pro ochranu osobních údajů, https://www.uoou.gov.cz). Because we hold no personal data of our own, most requests concern the hosting logs; contact the address above.

## Open source

The code is open at the public repository: https://github.com/cimenta/agent-atlas-academy. You can check for yourself what the site does.

## Changes

If this policy changes, the new version is published on this page.
