"use server";

import { AuthError } from "next-auth";
import { signIn } from "../../auth";

export async function authenticate(_previousState, formData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/portal",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === "CredentialsSignin"
        ? "The email or password is incorrect."
        : "Unable to sign in. Please try again.";
    }
    throw error;
  }
}
