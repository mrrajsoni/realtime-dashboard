Initial implementation involved having a single callback saved for each component called for a specific metric name. Resulting in the overriding of the callbacks and hence losing the data update on the components except the last one.

So example if we had two components cards subscribing to the same metricname, the first one froze on the UI without any error while the last one got the updated value. 

Client fans out for metricName -> Subscriber call  -> N set of callbacks per metricName.
While server fans out the metric name to the socket

Added a Set to hold the N number of callbacks for each metric name call which resulted in having each component getting the updated value without losing any of it's reference.

Final implementation:  "One socket per tab; server fans one metric to sockets, client fans one message to a callback Set per metric — same shape as YouTube live-count, one pub, N watchers.