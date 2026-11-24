---
title: How to estimate the study time of a run
section: basics
order: 4.6
summary: A simple sum that tells a student how long a run takes to study, and that you can use to fill in the study time of your own run.
related: [reading-a-replay, how-to-compare-runs]
---

The study time of a run is not the time the run took. It is the time a student needs to read the text, understand it and look through the tabs for the first time. A run that plays in 30 seconds can hold a thousand words of agent output, and those words take minutes to read. The Library uses the sum below for all its runs, and you can use the same sum when you fill in the study time of your own run or of a run you send to the Library.

**The sum**

1. **Reading.** Count the words of what the student must read: the task, the output of every agent, the notes of the replay and your description. Divide by 160 for minutes. If an agent only rewrites the text of the agent before it, count about a third of its words, because the student still checks it but does not read it anew.
2. **The pattern.** Add 15 seconds for every agent and 30 seconds for the diagram, so the student can learn what each agent is for and follow the arrows once.
3. **Your sections.** Add 20 seconds for every section of the description, to tie it to the diagram.
4. **The replay.** The first pass is as long as the longer of the run time and the reading. A second pass, to see why things happened, adds 30 percent of the reading, but never less than the run time.
5. **The tabs.** Add about 1.5 minutes for the result, the numbers and the settings, and 10 seconds for every call of the API log you want the student to open (count at most 6).
6. **Slack.** Add 10 percent for stopping, going back and thinking.

Round to whole minutes, and never write less than 3.

**Example.** A chain of three agents, 600 words to read, a 40 second run, two sections of description: reading 3.8 minutes, pattern 1.3, sections 0.7, replay 3.8 + 1.1 = 4.9, tabs 2, together 12.7, with slack 14 minutes.

It is an estimate for an average student, not a measurement. If you know your students are faster or slower, change the 160 words a minute and keep the rest.
