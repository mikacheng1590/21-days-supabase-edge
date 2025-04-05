// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'
import axios from 'npm:axios'

console.log("Functions initialized")
const PROJECT_EXPIRED = 'project_expired'
const ENTRY_MISSED = 'entry_missed'
const EMAIL_SENT = 'email_sent'
const EMAIL_FAILED = 'email_failed'
const TABLE_EMAIL_NOTIFICATION = 'email_notifications'
const TWENTY_ONE_DAYS_URL = 'https://21-days.mikacheng.com'

Deno.serve(async (req) => {
  let res = null
  let emailSentStatus = EMAIL_FAILED
  let emailData = []
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const { data, error } = await supabase
      .rpc("get_emails_to_be_sent")

    if (error) {
      throw new Error({
        supabaseError: error,
        message: `Error fetching emails to be sent`,
      })
    }

    console.log('data: ', data)

    emailData = data

    const expiredProjects = emailData.filter(record => record.content === PROJECT_EXPIRED).map(record => {
      return {
        email: record.preferred_email,
        subject: `Oops... Your project ${record.title} is expired...`,
        html: `<div>Your project is expired. Go to <a href="${TWENTY_ONE_DAYS_URL}" target="_blank">21 Days</a> to create a new project now!</div>`
      }
    })

    const missedEntries = emailData.filter(record => record.content === ENTRY_MISSED).map(record => {
      return {
        email: record.preferred_email,
        subject: `Hey! You missed an entry for project ${record.title}!`,
        html: `<div>You missed an entry. Go to <a href="${TWENTY_ONE_DAYS_URL}" target="_blank">21 Days</a> to create a new entry now or the project will be expired soon!</div>`
      }
    })

    console.log('name: ', Deno.env.get('EMAIL_SENDING_USERNAME'))
    const { data: emailSentData, status } = await axios.post(Deno.env.get('EMAIL_SENDING_URL'), {
      bcc: [...expiredProjects, ...missedEntries],
    }, {
      auth: {
        username: Deno.env.get('EMAIL_SENDING_USERNAME'),
        password: Deno.env.get('EMAIL_SENDING_PASSWORD'),
      }
    })

    console.log('emailSentData: ', emailSentData)
    console.log('status: ', status)

    if (status !== 200) {
      throw new Error(emailSentData.error)
    }

    emailSentStatus = EMAIL_SENT

    res = {
      error: null,
      success: true,
    }
  } catch(e) {
    console.error(e)

    res = {
      error: e,
      success: false,
    }
  } finally {
    // update sent_to, status, updated_at
    const rowsToUpdate = emailData.map(record => {
      return {
        id: record.e_id,
        project_id: record.id,
        sent_to: record.preferred_email,
        content: record.content,
        status: emailSentStatus,
        updated_at: new Date().toISOString(),
      }
    })

    const { data: updatedData, error: updateError } = await supabase
      .from(TABLE_EMAIL_NOTIFICATION)
      .upsert(rowsToUpdate)

    console.log('updateError: ', updateError)
  }

  return new Response(
    JSON.stringify(res),
    { headers: { "Content-Type": "application/json" } },
  )
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/email-notification' \
    --header 'Authorization: Bearer {token}' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
