---
title: Messages, system and tools
section: tools-and-output
order: 15.5
summary: What an application really sends to a model in one call, why a conversation is a list of messages, and how the system prompt differs from them.
related: [context-window, agent-instructions, tools, what-each-agent-sees, structured-output]
---

When an application "talks" to a model, it makes one web request and gets one answer. That request is a piece of JSON with a few named parts. This article walks through the three that matter most, **messages**, **system** and **tools**, using the Messages API of Anthropic as the example. Other providers use different names and slightly different shapes, but the ideas are the same.

**A call has no memory**

The model remembers nothing between calls. If you ask a question and then a follow-up, the follow-up only makes sense because the application sends the first question and the first answer again, together with the new question. A "conversation" is not something the model holds. It is a **list the application keeps and re-sends in full on every call**. This is the single most important fact on this page, and it explains why a long conversation costs more with every turn. See [the context window](#/learn/context-window).

**The main parts of a request**

```json
{
  "model": "a model id",
  "max_tokens": 1024,
  "system": "You are a careful research assistant.",
  "messages": [
    { "role": "user", "content": "What is the capital of France?" }
  ],
  "tools": [ ... ]
}
```

- **model** says which model answers.
- **max_tokens** is the most text the model may write in this answer. It does not limit what you send.
- **system** is the standing instruction: who the model is and what rules it follows.
- **messages** is the conversation so far.
- **tools** lists the functions the model may ask the application to run. Optional.
- There are more settings, such as `stop_sequences` (text that ends the answer when the model writes it), `temperature` and `tool_choice`. They tune the call. They are not content.

**messages: a list of turns**

Each item in `messages` has a **role** and a **content**.

- `user` is what comes from the person or from the application.
- `assistant` is what the model said earlier.

The list is meant to **alternate**: user, assistant, user, assistant, and the last item is normally from the user, because the model is about to write the next assistant turn. This is why more than one message can be sent. Sending three messages does not mean three questions. It means "here is the story so far, now continue it":

```json
"messages": [
  { "role": "user", "content": "Pick a number between 1 and 10." },
  { "role": "assistant", "content": "7." },
  { "role": "user", "content": "Double it." }
]
```

The model answers "14" only because the first two turns are in the list. Remove them and "Double it" means nothing.

Some details from the API reference:

- If two turns in a row have the same role, the API **combines** them into one turn. You cannot rely on two user messages being kept apart.
- You can write turns that the model never wrote. The application may put any text in an `assistant` turn. This is how an application edits, shortens or invents history.
- If the **last** message is from `assistant`, the model does not start a new turn. It **continues that text**. This is called a **prefill**, and it is a way to push the start of the answer, for example by putting an opening bracket there. Some newer models no longer accept it and return an error.

**content: text, or a list of blocks**

`content` is either a plain string, which is shorthand for one text block, or a list of **blocks**. Each block has a `type`:

- `text`: ordinary text.
- `image` and `document`: a picture or a PDF, given as data or a link.
- `tool_use`: the model asking for a tool (see below).
- `tool_result`: the application's answer to such a request.
- `thinking`: the model's own reasoning, when thinking is on. It must be sent back unchanged.

A single turn can mix them, for example a user turn with a question and a document.

**system: the standing instruction, outside the conversation**

`system` is a separate field. It is a string, or a list of text blocks. There is **no "system" role in the list of messages**: the instruction does not take part in the alternation, and it is not one of the turns.

What does that change in practice?

- **Different job.** `system` says who the model is and how it behaves for the whole call: its role, its rules, the format it should answer in. `messages` is what is being discussed. In the words of an agent, `system` is the **job description** and `messages` is the **work on the desk**.
- **Different weight.** Models are trained to treat the system text as the more lasting, more authoritative part. A rule there is followed more reliably than the same rule buried in a user turn. It is not a lock, though. A model can still be talked out of it, which is why [prompt injection](#/learn/prompt-injection) is a real problem.
- **Different lifetime.** The application usually sends the same `system` on every call of a run, and the `messages` grow. That stable start is also what makes **prompt caching** possible: the provider can reuse the processed beginning of a request, so a long, unchanged system is cheaper to send again.
- **Different author.** `system` is written by the application's builder. A user turn may come from an end user, or from a web page or a tool result. That difference in trust is the reason the two are kept apart. See [trust boundaries](#/learn/trust-boundaries).

Both are billed as input tokens. Moving text from one to the other does not make it free.

**tools: what the model may ask for**

A model only produces text. A **tool** is how it gets anything else done. The application describes each tool in `tools`:

```json
"tools": [
  {
    "name": "get_weather",
    "description": "Current weather for a city.",
    "input_schema": {
      "type": "object",
      "properties": { "city": { "type": "string" } },
      "required": ["city"]
    }
  }
]
```

The `description` is what the model reads to decide when to use it, so it matters as much as the name. The `input_schema` is a JSON Schema that says what inputs the tool takes.

A tool use is a **round trip over more than one message**. This is the second reason a call has many messages:

1. The application sends the question and the tool list.
2. The model answers with an `assistant` turn that holds a `tool_use` block, for example `{ "type": "tool_use", "id": "toolu_1", "name": "get_weather", "input": { "city": "Prague" } }`. Its `stop_reason` is `tool_use`: it is not finished, it is waiting.
3. The application runs the tool itself. The model never runs anything.
4. The application sends the whole list again, now with the assistant turn added, and a new **user** turn that holds a `tool_result` block with the same `tool_use_id` and the result as its content. A failed tool can say so with `is_error`.
5. The model reads the result and either asks for another tool or writes the final answer, with `stop_reason` `end_turn`.

That is the [agent loop](#/learn/agent-loop) in its plainest form: a list that grows by two turns for every tool used. The `tool_choice` setting can let the model decide (`auto`), require some tool (`any`), require one named tool, or forbid tools (`none`).

**The answer**

The reply is one assistant message: a list of content blocks, a `stop_reason` and a `usage` count.

- `stop_reason` says why it stopped: `end_turn` (it finished), `max_tokens` (it was cut), `stop_sequence`, `tool_use` (it wants a tool), and a few others such as a refusal.
- `usage` has the input and output tokens, which is what you pay for. When caching is used it also counts the cached input.

The application adds this assistant message to its list, adds the next user turn, and calls again.

**Why a design with many agents sends different lists**

Every agent in a run is its own sequence of calls, with its own `system` and its own `messages`. What one agent knows is only what is in its list. That is why [what each agent sees](#/learn/what-each-agent-sees) is a design decision: a shared conversation puts everything into every list, a chain puts only the previous answer.

**Other providers**

The ideas travel, the field names do not. Google Gemini calls the assistant role `model`, takes the system text as `systemInstruction`, and keeps turns in `contents`. Providers that copy the OpenAI format put the system text as the first message with the role `system`. In Agent Atlas the engine always builds one request in the Anthropic shape and a small translator per provider turns it into the local shape, so the agents and the replay do not care which provider answered.

**In Agent Atlas**

- Each agent's instructions are sent as `system`, and the task and what other agents passed on are the first user message.
- The **API calls** tab of the replay shows the exact request of every call (the address, the headers and the body, with `system`, `messages` and `tools` in it) and what came back, with its `stop_reason` and `usage`. Use it to see these parts for yourself. Your key is shown as hidden.
- When an agent must answer in a fixed shape, the app can force it with a tool named `reply` and `tool_choice`, so the answer arrives as structured input and not as free text. See [structured output](#/learn/structured-output).
- The agent's own earlier messages are what the **Context** tab breaks down, so you can see the list grow from call to call.

Next time a run costs more than you expected, open the API calls tab and look at the number of messages in the late calls. That list is what you are paying for each time.
