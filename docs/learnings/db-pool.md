Initial implementation had multiple instances of DB pool being created which could lead to potential DB failure upon exhaustion of the pool quota.
what broke - (70-connection ceiling, 7 idle rows on a few clicks)

It was verified by checking the pg_activity when there were few API calls for the initial implementation returned multiple connections opened for the same process rather than reusing the idle connection once it was freed.

Introduced a singleton db client which was shared amongst all the Next route handler calls to facilitate reusability of the one pool resource for maximum connections availability.

Simple math = One pool per process

I had seven new Pool()s across Next routes plus the WS server — each capped at ~10, so one user could hold 70 of PG's 100 connections. I consolidated to one shared Pool per process — Next routes share a singleton, ws-server keeps its own since it's a separate process. Alternative was PgBouncer, but that's ops overhead we don't need at this scale. Failure mode it fixes is pool exhaustion under burst — queries waiting then too many clients.
