package ca.uhn.fhir.jpa.starter.security.dto;

import java.time.Instant;

/**
 * Uniform JSON error body returned for authentication failures (and bad login requests).
 *
 * @param status HTTP status code, e.g. {@code 401}
 * @param error short reason phrase, e.g. {@code "Unauthorized"}
 * @param message human-readable detail
 * @param timestamp ISO-8601 instant the error was produced
 */
public record ErrorResponse(int status, String error, String message, String timestamp) {

	public static ErrorResponse of(int status, String error, String message) {
		return new ErrorResponse(status, error, message, Instant.now().toString());
	}
}
