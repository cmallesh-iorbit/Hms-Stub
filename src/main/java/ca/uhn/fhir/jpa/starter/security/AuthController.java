package ca.uhn.fhir.jpa.starter.security;

import ca.uhn.fhir.jpa.starter.security.dto.ErrorResponse;
import ca.uhn.fhir.jpa.starter.security.dto.LoginRequest;
import ca.uhn.fhir.jpa.starter.security.dto.LoginResponse;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Authentication endpoints.
 *
 * <ul>
 *   <li>{@code POST /auth/login} — exchange username/password for a Bearer token.</li>
 *   <li>{@code POST /auth/logout} — revoke the presented Bearer token.</li>
 * </ul>
 *
 * <p>Served by the Spring {@code DispatcherServlet} (mapped at {@code /}); does not collide with
 * HAPI's {@code /fhir/*} servlet.
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

	private static final String BEARER_PREFIX = "Bearer ";

	private final AuthProperties authProperties;
	private final TokenService tokenService;

	public AuthController(AuthProperties authProperties, TokenService tokenService) {
		this.authProperties = authProperties;
		this.tokenService = tokenService;
	}

	@PostMapping("/login")
	public ResponseEntity<?> login(@RequestBody(required = false) LoginRequest request) {
		if (request == null
				|| isBlank(request.username())
				|| isBlank(request.password())) {
			return ResponseEntity.badRequest()
					.body(
							ErrorResponse.of(
									HttpStatus.BAD_REQUEST.value(),
									HttpStatus.BAD_REQUEST.getReasonPhrase(),
									"Both 'username' and 'password' are required."));
		}

		if (!credentialsMatch(request.username(), request.password())) {
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
					.header(HttpHeaders.WWW_AUTHENTICATE, "Bearer")
					.body(
							ErrorResponse.of(
									HttpStatus.UNAUTHORIZED.value(),
									HttpStatus.UNAUTHORIZED.getReasonPhrase(),
									"Invalid username or password."));
		}

		String token = tokenService.issue(request.username());
		return ResponseEntity.ok(
				LoginResponse.bearer(token, tokenService.getTokenValiditySeconds()));
	}

	@PostMapping("/logout")
	public ResponseEntity<Void> logout(
			@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authHeader) {
		if (authHeader != null && authHeader.startsWith(BEARER_PREFIX)) {
			tokenService.revoke(authHeader.substring(BEARER_PREFIX.length()).trim());
		}
		return ResponseEntity.noContent().build();
	}

	private boolean credentialsMatch(String username, String password) {
		// Constant-time comparison to avoid leaking credential length/contents via timing.
		boolean userOk = constantTimeEquals(username, authProperties.getUsername());
		boolean passOk = constantTimeEquals(password, authProperties.getPassword());
		return userOk && passOk;
	}

	private static boolean constantTimeEquals(String a, String b) {
		if (a == null || b == null) {
			return false;
		}
		return MessageDigest.isEqual(
				a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
	}

	private static boolean isBlank(String s) {
		return s == null || s.isBlank();
	}
}
