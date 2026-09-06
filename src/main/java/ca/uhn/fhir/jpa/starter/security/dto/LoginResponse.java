package ca.uhn.fhir.jpa.starter.security.dto;

/**
 * Successful response from {@code POST /auth/login}.
 *
 * @param token the opaque Bearer token to send as {@code Authorization: Bearer <token>}
 * @param tokenType always {@code "Bearer"}
 * @param expiresIn lifetime in seconds (0 means the token does not expire)
 */
public record LoginResponse(String token, String tokenType, long expiresIn) {

	public static LoginResponse bearer(String token, long expiresIn) {
		return new LoginResponse(token, "Bearer", expiresIn);
	}
}
