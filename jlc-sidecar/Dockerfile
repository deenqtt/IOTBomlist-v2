FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Copy the main jar and the libs folder
COPY jlc-sidecar.jar .
COPY libs/ ./libs/

# The sidecar doesn't need to load the backend .env anymore 
# because docker-compose will pass the variables directly.
EXPOSE 8089

CMD ["java", "-cp", "jlc-sidecar.jar:libs/*", "com.example.jlcsidecar.JlcSidecarApplication"]
