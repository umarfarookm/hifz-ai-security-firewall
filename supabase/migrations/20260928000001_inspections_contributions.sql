-- Adds the score-contribution breakdown to inspections, needed for the Event
-- detail screen (docs/architecture/LLD.md §10: "Signals, contributions,
-- investigator plan trace, guard checks, raw vs. sanitized view").
-- Was missed in the initial schema — scoreRisk() has always computed this,
-- it just wasn't being persisted.

alter table inspections
  add column contributions jsonb not null default '[]';
