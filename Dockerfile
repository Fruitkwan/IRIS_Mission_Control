ARG IMAGE=intersystemsdc/iris-community:2026.2-zpm

# Stage 1: build the React frontend
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
COPY scripts/ scripts/
COPY spec/ spec/
RUN cd frontend && npm run build   # outputs to /app/web

# Stage 2: IRIS image with the built portal installed as a ZPM module
FROM $IMAGE

WORKDIR /home/irisowner/irisops

COPY --chown=${ISC_PACKAGE_MGRUSER}:${ISC_PACKAGE_IRISGROUP} module.xml .
COPY --chown=${ISC_PACKAGE_MGRUSER}:${ISC_PACKAGE_IRISGROUP} iris.script .
COPY --chown=${ISC_PACKAGE_MGRUSER}:${ISC_PACKAGE_IRISGROUP} src/ ./src/
COPY --from=build --chown=${ISC_PACKAGE_MGRUSER}:${ISC_PACKAGE_IRISGROUP} /app/web ./web

USER ${ISC_PACKAGE_MGRUSER}

RUN iris start IRIS && \
    iris session IRIS < iris.script && \
    iris stop IRIS quietly
