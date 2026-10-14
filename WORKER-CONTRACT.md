# Processing boundary and worker plan

## Implemented locally

Draft recordings do not create jobs. A request snapshots take ID, member/course labels, start/end seconds, destination, request timestamp and schema version. Duplicate matching active/completed requests are rejected. Cancelling a running browser job aborts processing and terminates the worker; output is discarded. Reloading does not restart work. Jobs are durable in IndexedDB only.

## Proposed service contract (not deployed)

The separate local portfolio service now implements an explicit CPU render step (upload → prepare → ready → publish/withdraw), disk storage and family-scoped reads. It does not implement the distributed inference queue described below. Local uploads occur only on Prepare portfolio clip, after browser analysis and coach review. Its demo session endpoint must be replaced before deployment. Raw uploads are removed after the render attempt. Uploads interrupted before a render request may require cleanup; no scheduled retention worker is implemented.

POST /v1/jobs accepts an authenticated submission with immutable asset revision, clip range, rubric/model version, destination and idempotency key. A server validates ownership, clip bounds and quota before acknowledging the job. Uploading/storing a draft never triggers processing. Only a committed job can be leased by a worker.

The video transfer and processing submission must be separate. Prefer extracting/uploading the selected clip; if an original must be uploaded, issue a restricted asset reference and have workers decode only the authorized interval. A manifest alone never authorizes an arbitrary asset URL. Reject user-provided file paths and remote fetch URLs.

State machine: requested → awaiting_upload → queued → leased → running → completed / failed. Cancellation uses cancel_requested → cancelled, with acknowledgement. Workers check cancellation between segments. Expiring leases and fenced attempt IDs prevent stale workers publishing output. Idempotency and retry budgets prevent duplicate GPU billing. Cancellation may incur charges for work already performed.

Onsite and rented GPU workers implement the same result schema. Each takes a signed job/asset reference and emits measurements, timestamped evidence, coverage/uncertainty, model/rubric versions and timings. No machine-created performance grade is published without rubric validation and coach confirmation.

The server owns authorization, access to member videos, lifecycle, leases, audit history, retention/deletion and result acceptance. UI state is never sufficient authorization. The service must delete derived frames/results along with assets according to the chosen retention rules. Set GPU concurrency and spending limits before deploying a remote worker. Do not auto-retry cancellation or invalid input.

## Acceptance gates

- Repeated failed/restarted recordings produce zero jobs and zero GPU calls.
- A chosen clip creates one job; network retries reuse its idempotency key.
- Clip edits after submission cannot mutate the requested job.
- Cancel before lease prevents processing; cancel during execution prevents publication after acknowledgement.
- Server enforces member/coach access independently of client fields.
- An interrupted upload can resume without creating duplicate requests.
- Stale workers cannot overwrite the output of a later attempt.
