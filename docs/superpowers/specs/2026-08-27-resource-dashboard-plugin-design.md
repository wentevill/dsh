# Resource Dashboard Plugin Design

## Goal

Add an independently navigable resource dashboard plugin to DeepSeek Harness. The dashboard presents DSH activity, host health, and chat outcomes over a rolling 24-hour window. Every metric has both a numeric value and a chart.

The plugin must bound its local storage: it retains no data older than 24 hours and reuses fixed minute slots instead of appending history forever.

## Scope and Metric Definitions

The dashboard contains four sections: Overview, DSH Resources, Host, and Chat.

DSH metrics are:

- Token: the sum of input, output, and reasoning tokens during the last 24 hours. The detailed chart preserves those three components.
- Sessions: distinct sessions with activity during the last 24 hours.
- Chat count: turns that reached a terminal `turn/end` event during the last 24 hours.

Chat outcomes are derived from the terminal turn reason. A completed turn is successful; error, cancellation, and other non-completed terminal reasons are failures. The dashboard shows success count, failure count, and success rate. Empty or still-running turns are not counted.

Host metrics are CPU utilization, memory used and total, disk used and total for the configured data volume, and CPU temperature. Current host values update every five seconds. Detailed history uses one-minute aggregates over the last 24 hours.

macOS and Linux are supported. On Windows, the dashboard and all DSH/Chat metrics remain usable, while the Host section displays a stable “Coming soon” state. If only CPU temperature is unavailable on a supported platform, that metric displays “Unavailable” without degrading the other host metrics.

## User Interface

The plugin contributes an independent dashboard page with a left-side section navigator:

- Overview shows numeric cards and compact trends for Token, Sessions, Chat, success rate, CPU, memory, disk, and CPU temperature.
- DSH Resources expands Token, Sessions, and Chat activity into full 24-hour charts.
- Host expands CPU, memory, disk, and temperature charts and shows the timestamp of the latest successful sample.
- Chat shows success and failure counts, success rate, and their 24-hour behavior.

Chart types follow the meaning of each metric:

- Token uses a stacked area chart for input, output, and reasoning composition.
- Active Sessions uses a line chart; the headline number is the exact 24-hour distinct count.
- CPU and temperature use aligned line charts. Temperature disappears into an explicit unavailable state rather than implying zero.
- Memory uses an area chart for used memory with total memory as its fixed upper reference.
- Disk uses a donut for the current used/free ratio and a small line chart for the 24-hour change in used bytes.
- Chat uses a zero-centered diverging chart: successful turns are green and extend upward, while failed turns are red and extend downward. A separately scaled line shows success rate so quantity and percentage are not conflated.

Full charts provide axes, units, legends, accessible labels, and tooltips. Compact overview charts omit nonessential chrome but use the same data snapshot as their headline values. Layouts stack at narrow widths without horizontal page scrolling.

## Architecture

The resource dashboard is a single DSH plugin with four focused units.

`DshMetricsCollector` subscribes to the existing durable session and LLM event surfaces. It records token usage, session activity, and terminal turn outcomes. It does not parse session JSONL files or copy prompt, response, title, workspace, or tool content.

`HostMetricsCollector` samples the supported operating system every five seconds. Raw samples exist only in memory. At each minute boundary it emits aggregate values such as average and maximum utilization and the latest capacity values. Platform-specific readers implement one internal interface so unsupported temperature and Windows behavior are isolated.

`MetricsStore` owns the plugin-private SQLite database. It stores minute aggregates, exact recent session activity, collector status, and schema metadata. It exposes snapshot queries rather than leaking SQL or storage models to the remote boundary.

`DashboardRemote` returns the current headline values, 24-hour series, platform capability states, last-success timestamps, and bounded error status in one snapshot. The client polls every five seconds, replaces its view atomically, and stops polling when its plugin fiber is disposed.

The client contributes one navigation entry and one route through the existing client slot and plugin injection mechanisms. It owns presentation only; all authoritative aggregation remains in the host plugin.

## Rolling Storage and Disk Bounds

Time-series storage uses 1,440 fixed minute slots, one for every minute in 24 hours. Each write maps the absolute minute to a slot and upserts that slot with the new absolute bucket timestamp and aggregate values. Reaching a slot from the previous day overwrites it. Queries verify the stored absolute timestamp, so an old slot can never appear as current data.

Exact session distinctness uses one activity row per session identifier with its latest observed minute. Every activity write updates that row, and rows outside the rolling boundary are deleted in the same transaction. Session identifiers are used only for counting and are never returned to the client.

The database enables incremental auto-vacuum. Startup and periodic maintenance remove expired session rows, reclaim free pages incrementally, checkpoint and truncate the write-ahead log, and remove obsolete schema data. No raw five-second host samples are persisted. This makes steady-state series storage fixed-size and prevents journal files or expired session rows from accumulating indefinitely.

The store enforces the retention boundary on both writes and reads. A missed cleanup cannot expose old data, and the next successful transaction repairs it. Database size and maintenance failures are observable as plugin health metadata, but no metric payload or user content is logged.

## Data Flow

DSH events update the current minute slot and the recent-session activity table transactionally. Host samples update an in-memory minute accumulator; the completed aggregate replaces its designated slot. The store calculates the 24-hour DSH totals and distinct session count and returns ordered series with absent minutes represented as gaps rather than fabricated zero measurements.

The remote snapshot is internally consistent: the numeric totals and chart series are read against the same SQLite snapshot, then combined with the latest in-memory host sample. The client never adds independent totals from chart points.

## Failure and Recovery

A single host read failure retains the last successful value, marks it stale, and records its timestamp. A later successful sample clears the degraded state automatically. An unavailable CPU sensor affects only temperature.

A SQLite write failure does not crash DSH. The collector reports a bounded, non-sensitive degraded state and retries on the next scheduled update. Reads continue from the last committed snapshot. Database initialization or migration failures keep the dashboard route available with an explicit unavailable state.

On restart, the plugin restores only retained minute aggregates and recent session activity. It never scans or mutates the durable session log. The current partial minute resumes in a new transaction, and expired data is removed before the first snapshot is served.

## Privacy and Security

The plugin stores numeric aggregates, timestamps, platform capability states, and session identifiers solely for exact local distinct counting. It does not store message content, titles, prompts, model responses, tool arguments/results, credentials, paths, or user labels. Remote responses contain aggregate data only.

All database and platform paths are resolved through DSH-owned plugin storage facilities. The client cannot choose filesystem targets or issue arbitrary metric queries.

## Testing

Pure aggregation tests cover token components, session deduplication, terminal outcome classification, minute boundaries, missing minutes, and the exact rolling 24-hour cutoff.

Storage tests cover all 1,440 slot mappings, next-day overwrite, stale-slot rejection, expired session removal, restart recovery, bounded WAL maintenance, and recovery after a failed write. A long synthetic run verifies that time-series row count and database growth stabilize rather than increasing with elapsed days.

Platform adapter tests cover valid macOS and Linux readings, unavailable temperature, partial sampling failures, and the Windows `coming_soon` capability state.

Remote and client tests verify that headline numbers and charts share one snapshot, five-second polling is disposed correctly, stale timestamps render, each metric includes both a number and a chart, the Chat chart maps success upward in green and failure downward in red, and narrow layouts reflow.

Packaging tests verify the plugin manifest, host and client entry points, route injection, built artifact contents, and installation through the existing desktop plugin flow.

## Acceptance Criteria

- An independent Resource Dashboard route exposes Overview, DSH Resources, Host, and Chat sections.
- Every requested metric has a numeric representation and an appropriate chart covering the rolling last 24 hours.
- Host current values refresh every five seconds; persisted history is aggregated by minute.
- Chat success is green and upward, failure is red and downward, and success rate remains independently scaled.
- macOS and Linux collect host metrics; Windows clearly reports Host support as coming soon; unavailable temperature cannot break other metrics.
- Restart preserves only eligible 24-hour aggregates without scanning session logs.
- Minute-series storage is limited to 1,440 overwriteable slots, expired session activity is deleted, and SQLite/WAL maintenance prevents unbounded disk consumption.
- No conversation or tool content is stored or returned by the plugin.
