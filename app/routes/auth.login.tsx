import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useRouteError } from "@remix-run/react";
import { login } from "~/shopify.server";

const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/auth?${url.searchParams.toString()}`);
  }
  return json({ showForm: Boolean(login) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const cloned = request.clone();
  const formData = await cloned.formData();
  const shop = formData.get("shop")?.toString().trim() ?? "";
  if (!SHOP_DOMAIN_RE.test(shop)) {
    return json({ errors: { shop: "Enter a valid .myshopify.com domain" } });
  }
  const errors = await login(request);
  return json(errors);
};

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const shopError = (actionData as { errors?: { shop?: string } } | null)?.errors?.shop;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ width: 360 }}>
        <h1 style={{ marginBottom: 24 }}>CartCloser — Log in</h1>
        {loaderData.showForm ? (
          <Form method="post">
            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", marginBottom: 4 }}>
                Shop domain
              </span>
              <input
                type="text"
                name="shop"
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                placeholder="my-shop-domain.myshopify.com"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: shopError ? "1px solid red" : "1px solid #ccc",
                  borderRadius: 4,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </label>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "10px 0",
                background: "#008060",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                fontSize: 14,
                cursor: "pointer",
                marginTop: 12,
              }}
            >
              Log in
            </button>
            {shopError ? (
              <p style={{ color: "red", marginTop: 8 }}>{shopError}</p>
            ) : null}
          </Form>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Login error</h1>
      <p>{error instanceof Error ? error.message : "Something went wrong."}</p>
    </div>
  );
}
