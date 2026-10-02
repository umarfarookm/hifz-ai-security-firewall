/** Plain-English labels for the demo agent's tools and the Action Guard's checks (rules: docs/architecture/LLD.md section 3.8). */
export const TOOL_PLAIN: Record<string, string> = {
  read_inbox: "Read your inbox",
  summarize: "Write a summary",
  send_email: "Send an email",
  read_secrets: "Look up a secret",
};

export const CHECK_PLAIN: Record<string, string> = {
  G1: "Is this tool one the assistant may use?",
  G2: "Are its inputs valid?",
  G3: "Is the destination one we trust?",
  G4: "Is any secret about to leave?",
  G5: "Did it read untrusted content first?",
  G6: "Is it making too many risky calls?",
};

export const CONTENT_TYPE_PLAIN: Record<string, string> = {
  text: "Plain text",
  markdown: "Markdown",
  html: "Web page",
  email: "Email",
  json: "Data (JSON)",
  source_code: "Source code",
  pdf: "PDF document",
  docx: "Word document",
  image: "Picture",
};

export const SOURCE_PLAIN: Record<string, string> = {
  user_message: "a message someone typed",
  web_page: "a web page",
  email: "an email",
  api_response: "another app or API",
  document: "a document or file",
  tool_output: "the output of a tool",
};

export const TRUST_PLAIN: Record<string, string> = {
  trusted: "trusted",
  semi_trusted: "partly trusted",
  untrusted: "not trusted",
};

/** What each committed attack type means, in words a non-specialist can read. */
export const ATTACK_PLAIN: Record<string, string> = {
  instruction_override: "Tries to make the AI ignore its rules.",
  role_change: "Tries to change who the AI thinks it is.",
  secret_extraction: "Tries to get the AI to reveal secrets.",
  tool_abuse: "Tries to make the AI use its tools for something harmful.",
  credential_theft: "Asks for passwords or keys.",
  encoded_instructions: "Hides a command in encoded text.",
  indirect_prompt_injection: "Hides a command in content the AI is asked to read.",
};
