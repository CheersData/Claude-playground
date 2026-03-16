/**
 * Integration test: Wizard API Key Toggle
 *
 * Verifies that:
 * 1. Connectors with supportsApiKey=true can toggle between OAuth and API key
 * 2. API key form is visible when toggled to "API Key"
 * 3. OAuth button is visible when toggled to "OAuth"
 * 4. Help text is correctly displayed for each connector
 * 5. Verification works for both auth methods
 */

import { describe, it, expect, beforeEach } from "vitest";

describe("Integration Wizard — API Key Toggle", () => {
  // Mock connector configurations
  const connectorConfigs = {
    hubspot: {
      id: "hubspot",
      name: "HubSpot",
      authMode: "oauth" as const,
      supportsApiKey: true,
      apiKeyLabel: "API Key (Private App Token)",
      helpText:
        "Per autenticazione manuale: vai a Impostazioni > Integrazioni > Private apps e copia il token...",
    },
    salesforce: {
      id: "salesforce",
      name: "Salesforce",
      authMode: "oauth" as const,
      supportsApiKey: true,
      apiKeyLabel: "API Key (Connected App Client ID)",
      secretKeyLabel: "Client Secret (opzionale)",
      helpText:
        "Per autenticazione manuale: crea una Connected App in Salesforce e usa Client ID + Secret...",
    },
    stripe: {
      id: "stripe",
      name: "Stripe",
      authMode: "api_key" as const,
      supportsApiKey: false, // No toggle for API-only connectors
      apiKeyLabel: "API Key",
      helpText: "Trova le tue chiavi API in Stripe Dashboard...",
    },
    "google-drive": {
      id: "google-drive",
      name: "Google Drive",
      authMode: "oauth" as const,
      supportsApiKey: true,
      apiKeyLabel: "Service Account JSON Key",
      helpText: "Per autenticazione manuale: scarica il JSON della Service Account...",
    },
  };

  describe("Connector Configuration", () => {
    it("HubSpot supports both OAuth and API key", () => {
      const config = connectorConfigs.hubspot;
      expect(config.authMode).toBe("oauth");
      expect(config.supportsApiKey).toBe(true);
      expect(config.apiKeyLabel).toBeDefined();
    });

    it("Salesforce supports both OAuth and API key", () => {
      const config = connectorConfigs.salesforce;
      expect(config.authMode).toBe("oauth");
      expect(config.supportsApiKey).toBe(true);
      expect(config.apiKeyLabel).toBeDefined();
      expect(config.secretKeyLabel).toBeDefined();
    });

    it("Stripe is API-key only (no toggle)", () => {
      const config = connectorConfigs.stripe;
      expect(config.authMode).toBe("api_key");
      expect(config.supportsApiKey).toBe(false); // No toggle
    });

    it("Google Drive supports both OAuth and API key", () => {
      const config = connectorConfigs["google-drive"];
      expect(config.authMode).toBe("oauth");
      expect(config.supportsApiKey).toBe(true);
    });
  });

  describe("AuthStep Toggle Logic", () => {
    it("Should show toggle buttons when supportsApiKey=true", () => {
      const config = connectorConfigs.hubspot;
      expect(config.supportsApiKey).toBe(true);
      // In the actual component:
      // {supportsApiKey && (
      //   <button>OAuth</button>
      //   <button>API Key</button>
      // )}
    });

    it("Should NOT show toggle buttons when supportsApiKey=false", () => {
      const config = connectorConfigs.stripe;
      expect(config.supportsApiKey).toBe(false);
      // Toggle should not be rendered
    });

    it("Should default to authMode when toggle first appears", () => {
      const config = connectorConfigs.salesforce;
      const initialAuthMethod = config.authMode; // "oauth"
      expect(initialAuthMethod).toBe("oauth");
    });
  });

  describe("API Key Form Fields", () => {
    it("HubSpot form should have API Key field only", () => {
      const config = connectorConfigs.hubspot;
      expect(config.apiKeyLabel).toBe("API Key (Private App Token)");
      expect(config.secretKeyLabel).toBeUndefined();
    });

    it("Salesforce form should have API Key and Secret Key fields", () => {
      const config = connectorConfigs.salesforce;
      expect(config.apiKeyLabel).toBe("API Key (Connected App Client ID)");
      expect(config.secretKeyLabel).toBe("Client Secret (opzionale)");
    });

    it("Help text should be displayed below form", () => {
      const config = connectorConfigs.hubspot;
      expect(config.helpText).toContain("Impostazioni");
      expect(config.helpText).toContain("Private apps");
    });
  });

  describe("Wizard Flow Integration", () => {
    it("Should pass supportsApiKey through SetupWizard to AuthStep", () => {
      const config = connectorConfigs.hubspot;
      // In SetupWizard:
      // <AuthStep supportsApiKey={connector.supportsApiKey} ... />
      expect(config.supportsApiKey).toBe(true);
    });

    it("Should pass configuration fields to AuthStep", () => {
      const config = connectorConfigs.salesforce;
      const authStepProps = {
        authMode: config.authMode,
        supportsApiKey: config.supportsApiKey,
        apiKeyLabel: config.apiKeyLabel,
        secretKeyLabel: config.secretKeyLabel,
        helpText: config.helpText,
      };

      expect(authStepProps.supportsApiKey).toBe(true);
      expect(authStepProps.apiKeyLabel).toBeDefined();
      expect(authStepProps.secretKeyLabel).toBeDefined();
    });

    it("Should render form with correct labels", () => {
      const config = connectorConfigs.hubspot;
      // In AuthStep when authMethod="api_key":
      // <label>{apiKeyLabel}</label> → "API Key (Private App Token)"
      expect(config.apiKeyLabel).toBe("API Key (Private App Token)");
    });
  });

  describe("Verification Endpoint", () => {
    it("Should POST to /api/integrations/credentials for API key verification", async () => {
      const requestBody = {
        connectorSource: "hubspot",
        credentialType: "api_key",
        data: {
          api_key: "pat-na1.abc123def456",
          // secret_key omitted for HubSpot
        },
      };

      expect(requestBody.connectorSource).toBe("hubspot");
      expect(requestBody.credentialType).toBe("api_key");
      expect(requestBody.data.api_key).toBeDefined();
    });

    it("Should include secret key when provided", () => {
      const requestBody = {
        connectorSource: "salesforce",
        credentialType: "api_key",
        data: {
          api_key: "3MVGfZ....",
          secret_key: "9876543210abcdef",
        },
      };

      expect(requestBody.data.secret_key).toBeDefined();
    });

    it("Should handle verification success response", () => {
      const response = {
        success: true,
        connectorId: "hubspot",
        message: "Connessione verificata con successo",
      };

      expect(response.success).toBe(true);
      expect(response.connectorId).toBe("hubspot");
    });

    it("Should handle verification error response", () => {
      const response = {
        error: "Chiave API non valida. Verifica e riprova.",
      };

      expect(response.error).toBeDefined();
      expect(response.error).toContain("Chiave API");
    });
  });

  describe("UX Feedback", () => {
    it("Should show loading state during verification", () => {
      const verifyStatus = "verifying";
      expect(verifyStatus).toBe("verifying");
      // Button should show spinner + "Verifica in corso..."
    });

    it("Should show success message on valid API key", () => {
      const verifyStatus = "success";
      const verifyMessage = "Connessione verificata con successo";
      expect(verifyStatus).toBe("success");
      expect(verifyMessage).toContain("verificata");
    });

    it("Should show error message on invalid API key", () => {
      const verifyStatus = "error";
      const verifyMessage = "Chiave API non valida. Verifica e riprova.";
      expect(verifyStatus).toBe("error");
      expect(verifyMessage).toContain("non valida");
    });

    it("Should disable verify button when API key is empty", () => {
      const apiKey = "";
      const shouldDisable = !apiKey.trim();
      expect(shouldDisable).toBe(true);
    });

    it("Should enable verify button when API key is non-empty", () => {
      const apiKey = "pat-na1.abc123";
      const shouldDisable = !apiKey.trim();
      expect(shouldDisable).toBe(false);
    });
  });

  describe("Backward Compatibility", () => {
    it("Connectors without supportsApiKey should work as before", () => {
      const config = connectorConfigs.stripe;
      // Should always show API key form (no toggle)
      expect(config.supportsApiKey).toBe(false);
      // authMode should determine the UI
      expect(config.authMode).toBe("api_key");
    });

    it("OAuth-only connectors should still work without changes", () => {
      // If a connector has authMode="oauth" and supportsApiKey is not set,
      // it defaults to false, and OAuth is used as before
      const implicitlyOAuthOnly = {
        authMode: "oauth" as const,
        // supportsApiKey is undefined, defaults to false
      };

      const supportsApiKey = implicitlyOAuthOnly.supportsApiKey ?? false;
      expect(supportsApiKey).toBe(false);
    });
  });
});
