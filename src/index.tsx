import React from "react";
import ReactDOM from "react-dom";
import { ErrorBoundary } from "react-error-boundary";
import Alert from "react-bootstrap/Alert";

import App from "./App";
import "bootstrap/dist/css/bootstrap.min.css";

ReactDOM.render(
  <ErrorBoundary
    fallbackRender={({ error, resetErrorBoundary }) => (
      <Alert variant="danger">
        Something went wrong:
        {error}
        <Alert.Link onClick={resetErrorBoundary}>Try again</Alert.Link>
      </Alert>
    )}
  >
    <App />
  </ErrorBoundary>,
  document.getElementById("root")
);
