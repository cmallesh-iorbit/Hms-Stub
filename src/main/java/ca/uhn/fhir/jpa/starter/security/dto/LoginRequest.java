package ca.uhn.fhir.jpa.starter.security.dto;

/**
 * Request body for {@code POST /auth/login}.
 *
 * <p>Presence of {@code username}/{@code password} is validated explicitly in the controller, so
 * this stays a plain record with no bean-validation dependency.
 */
public record LoginRequest(String username, String password) {}
