import * as React from "react";
import { AlertTriangle } from "lucide-react";

interface State {
  readonly hasError: boolean;
  readonly message?: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  public override state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Application error
          </div>
          <p>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
