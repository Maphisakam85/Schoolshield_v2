# Historical SQL archive

These eight files were absent from the linked migration ledger and have newer
canonical replacements, or collide with an already-applied version. Their exact
bytes and SHA-256 hashes are retained in manifest.json. They are outside the CLI's
active migrations directory so they cannot be accidentally replayed by db push.
No applied migration was renamed and no live history entry was invented/deleted.

Replacements: dataset invalidations (20261014170000); restored invitation delivery
(20261019100000); operational RPC restoration (20261014190000); private attachments
(20261014120000); canonical shifts (20261014220000); authoritative entities/scoped
datasets (20261013180000 through 20261013200000); lifecycle access
(20261017100000); parent-notice and anonymous-grant hardening (20261109120000).

Historical isolated tests may explicitly load these files through migration-path.
They are not the production installation path. Existing-school data and the
Security Officer implementation must not be rebuilt from this archive.
