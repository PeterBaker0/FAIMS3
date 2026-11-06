// SPDX-License-Identifier: Apache-2.0
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {useAuth} from '@/context/auth-provider';
import {postFeedback} from '@/hooks/queries';
import {feedbackPageUrl} from '@/lib/feedback-page-url';
import {INPUT_LIMITS, type FeedbackSource} from '@faims3/data-model';
import {
  Button as MuiButton,
  Dialog as MuiDialog,
  DialogActions,
  DialogContent as MuiDialogContent,
  DialogContentText,
  DialogTitle as MuiDialogTitle,
  TextField,
} from '@mui/material';
import {MessageSquare} from 'lucide-react';
import {useState} from 'react';
import {toast} from 'sonner';

const SUCCESS_TOAST = 'Thanks for your feedback.';
const ERROR_FALLBACK = 'Failed to send feedback. Please try again.';

async function submitFeedbackMessage({
  tokenUser,
  message,
  source,
}: {
  tokenUser: NonNullable<ReturnType<typeof useAuth>['user']>;
  message: string;
  source: FeedbackSource;
}) {
  await postFeedback({
    user: tokenUser,
    data: {
      message,
      source,
      pageUrl: feedbackPageUrl(),
    },
  });
}

type FeedbackFormFieldsProps = {
  message: string;
  onMessageChange: (value: string) => void;
  error: string | null;
  submitting: boolean;
  disabled: boolean;
  messageId: string;
};

function FeedbackFormFields({
  message,
  onMessageChange,
  error,
  submitting,
  disabled,
  messageId,
}: FeedbackFormFieldsProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={messageId}>Message</Label>
      <Textarea
        id={messageId}
        value={message}
        onChange={event => onMessageChange(event.target.value)}
        required
        maxLength={INPUT_LIMITS.LONG_TEXT_MAX_LENGTH}
        disabled={submitting || disabled}
        rows={6}
        data-testid="web-feedback-message"
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Control Centre header Feedback control. Own Radix Dialog root so it does
 * not open the layout Dialog wrapping the protected shell.
 */
export function FeedbackDialog({
  source = 'control-centre',
  triggerTestId = 'web-feedback-button',
}: {
  source?: FeedbackSource;
  triggerTestId?: string;
}) {
  const {user} = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmed = message.trim();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!trimmed || !user || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedbackMessage({
        tokenUser: user,
        message: trimmed,
        source,
      });
      toast.success(SUCCESS_TOAST);
      setMessage('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : ERROR_FALLBACK);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        className="mr-2 p-2"
        data-testid={triggerTestId}
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="inline-block" />
        <span className="align-middle font-semibold">Feedback</span>
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell the operators of this install about a problem or suggestion.
            Your message is emailed to support.
          </DialogDescription>
        </DialogHeader>
        <FeedbackFormFields
          message={message}
          onMessageChange={setMessage}
          error={error}
          submitting={submitting}
          disabled={!user}
          messageId="web-feedback-message"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="web-feedback-send"
            onClick={handleSubmit}
            disabled={!trimmed || submitting || !user}
          >
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Designer AppBar Feedback control. MUI Dialog stacked above the overlay.
 * The dialog (and therefore useAuth / POST) mounts only once opened so the
 * editor shell tests do not need an AuthProvider.
 */
export function DesignerFeedbackControl() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <MuiButton
        color="inherit"
        data-testid="web-designer-feedback-button"
        onClick={() => setOpen(true)}
        sx={{mr: 1, textTransform: 'none'}}
      >
        Feedback
      </MuiButton>
      {open ? (
        <DesignerFeedbackDialog open onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function DesignerFeedbackDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {user} = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmed = message.trim();

  const handleSubmit = async () => {
    if (!trimmed || !user || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedbackMessage({
        tokenUser: user,
        message: trimmed,
        source: 'designer',
      });
      toast.success(SUCCESS_TOAST);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : ERROR_FALLBACK);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MuiDialog
      open={open}
      onClose={submitting ? undefined : onClose}
      aria-labelledby="designer-feedback-title"
    >
      <MuiDialogTitle id="designer-feedback-title">
        Send feedback
      </MuiDialogTitle>
      <MuiDialogContent>
        <DialogContentText sx={{mb: 2}}>
          Tell the operators of this install about a problem or suggestion. Your
          message is emailed to support. This does not save or close the editor.
        </DialogContentText>
        <TextField
          autoFocus
          required
          margin="dense"
          id="designer-feedback-message"
          label="Message"
          fullWidth
          multiline
          minRows={4}
          value={message}
          onChange={event => setMessage(event.target.value)}
          slotProps={{
            htmlInput: {
              maxLength: INPUT_LIMITS.LONG_TEXT_MAX_LENGTH,
              'data-testid': 'web-designer-feedback-message',
            },
          }}
          disabled={submitting || !user}
        />
        {error ? (
          <DialogContentText color="error" role="alert" sx={{mt: 1}}>
            {error}
          </DialogContentText>
        ) : null}
      </MuiDialogContent>
      <DialogActions>
        <MuiButton onClick={onClose} disabled={submitting} color="inherit">
          Cancel
        </MuiButton>
        <MuiButton
          onClick={handleSubmit}
          disabled={!trimmed || submitting || !user}
          variant="contained"
          data-testid="web-designer-feedback-send"
        >
          {submitting ? 'Sending…' : 'Send'}
        </MuiButton>
      </DialogActions>
    </MuiDialog>
  );
}
