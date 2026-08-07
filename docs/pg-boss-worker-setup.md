# pg-boss Worker Operations

SiloCore uses pg-boss as the durable PostgreSQL queue transport for the backend worker. Normal API/worker startup manages the pg-boss schema automatically, including first-time creation and pending pg-boss migrations.

## Environment

The worker reads the same database as the API and uses `PGBOSS_SCHEMA` for the pg-boss schema name. The default schema is `pgboss`.

```bash
cd backend
export PGBOSS_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silocore"
export PGBOSS_SCHEMA="pgboss"
```

## Developer Checks

Generate SQL for review without touching the database:

```bash
npm run pgboss:plans
```

Apply pg-boss migrations manually when debugging or verifying a controlled development database:

```bash
npm run pgboss:migrate
```

Check the installed schema version:

```bash
npm run pgboss:version
```

Check for schema drift:

```bash
npm run pgboss:doctor
```

These commands are optional developer and operational helpers. A user pulling the repo should not need to run them before starting SiloCore.

## Worker Commands

Run the worker in development:

```bash
cd backend
npm run dev:worker
```

Run the compiled worker:

```bash
cd backend
npm run build
npm run start:worker
```

Docker Compose includes a `worker` service that uses the same backend image as the API and runs the worker command.
