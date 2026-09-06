package ca.uhn.fhir.jpa.starter.security;

import ca.uhn.fhir.jpa.starter.security.dto.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Renders a clean {@code 401} JSON body whenever an unauthenticated request hits a protected
 * endpoint, replacing Spring Security's default HTML/redirect behaviour.
 */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

	private final ObjectMapper objectMapper;

	public RestAuthenticationEntryPoint(ObjectMapper objectMapper) {
		this.objectMapper = objectMapper;
	}

	@Override
	public void commence(
			HttpServletRequest request,
			HttpServletResponse response,
			AuthenticationException authException)
			throws IOException {

		response.setStatus(HttpStatus.UNAUTHORIZED.value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setHeader("WWW-Authenticate", "Bearer");

		ErrorResponse body =
				ErrorResponse.of(
						HttpStatus.UNAUTHORIZED.value(),
						HttpStatus.UNAUTHORIZED.getReasonPhrase(),
						"A valid Bearer token is required. Obtain one via POST /auth/login.");
		objectMapper.writeValue(response.getOutputStream(), body);
	}
}
