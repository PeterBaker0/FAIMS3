// SPDX-License-Identifier: Apache-2.0
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import {INPUT_LIMITS} from '@faims3/data-model';
import {useState} from 'react';
import {useNotification} from '../../../context/popup';
import {selectActiveUser} from '../../../context/slices/authSlice';
import {useAppSelector} from '../../../context/store';
import {useIsOnline} from '../../../utils/customHooks';
import {postFeedback} from '../../../utils/apiOperations/client';
import {feedbackPageUrl} from './feedback-page-url';

const OFFLINE_COPY = 'A network connection is required to send feedback.';
const SUCCESS_TOAST = 'Thanks for your feedback.';
const ERROR_FALLBACK = 'Failed to send feedback. Please try again.';

/**
 * In-app feedback dialog for the data-collection App. Does not queue while
 * offline; the existing mailto SupportEmail / About Build row remains the
 * offline fallback.
 */
export function FeedbackDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {isOnline} = useIsOnline();
  const {showSuccess, showError} = useNotification();
  const activeUser = useAppSelector(selectActiveUser);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmed = message.trim();
  const sendDisabled = !trimmed || submitting || !isOnline || !activeUser;

  const handleClose = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (sendDisabled || !activeUser) return;
    setSubmitting(true);
    setError(null);
    try {
      await postFeedback({
        listingId: activeUser.serverId,
        username: activeUser.username,
        body: {
          message: trimmed,
          source: 'app',
          pageUrl: feedbackPageUrl(),
        },
      });
      showSuccess(SUCCESS_TOAST);
      setMessage('');
      onClose();
    } catch (err) {
      const text = err instanceof Error ? err.message : ERROR_FALLBACK;
      setError(text);
      showError(text);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="app-feedback-title"
    >
      <DialogTitle id="app-feedback-title">Send feedback</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{mb: 2}}>
          Tell the operators of this install about a problem or suggestion. Your
          message is emailed to support.
        </DialogContentText>
        {!isOnline ? (
          <DialogContentText color="text.secondary" sx={{mb: 2}}>
            {OFFLINE_COPY}
          </DialogContentText>
        ) : null}
        <TextField
          autoFocus
          required
          margin="dense"
          id="app-feedback-message"
          label="Message"
          fullWidth
          multiline
          minRows={4}
          value={message}
          onChange={event => setMessage(event.target.value)}
          slotProps={{
            htmlInput: {
              maxLength: INPUT_LIMITS.LONG_TEXT_MAX_LENGTH,
              'data-testid': 'app-feedback-message',
            },
          }}
          disabled={submitting || !isOnline}
        />
        {error ? (
          <DialogContentText
            color="error"
            role="alert"
            sx={{mt: 1}}
            data-testid="app-feedback-error"
          >
            {error}
          </DialogContentText>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={sendDisabled}
          variant="contained"
          data-testid="app-feedback-send"
        >
          {submitting ? 'Sending…' : 'Send'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
