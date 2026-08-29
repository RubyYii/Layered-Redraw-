# Data handling

`data/demo/` contains synthetic records used only to verify the pipeline. They are marked `synthetic: true` and must never enter a paper result table.

Create these untracked directories for a real run:

```text
data/pilot/study-a/
data/pilot/study-b/
data/pilot/expert/
data/coordinator/
data/frozen/governance/
data/raw/study-a/
data/raw/study-b/
data/raw/expert/
data/coding/
data/analysis/
```

Keep the original downloaded JSON returns immutable. Correct metadata through a separate amendment log; never edit a participant's raw return in place.

`data/pilot/` is permanently excluded from the main corpus. `data/coordinator/` holds flow, allocation, deviation, and linkage-free operational records. Approved governance documents and stage freeze records belong under `data/frozen/`. Contact details and signed consent records must remain in the separate institutionally approved systems named in the data-management plan.
