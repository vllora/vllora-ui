from traceloop.sdk import Traceloop
import os

from openai import OpenAI
from traceloop.sdk import Traceloop
from traceloop.sdk.decorators import workflow

Traceloop.init(api_key="tl_ea5e93f9f60f41d899b75f28cb3fdbb4",disable_batch=True, app_name="joke_generation_service")

@workflow(name="joke_creation1")
def create_joke():
  client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
  completion = client.chat.completions.create(
      model="gpt-3.5-turbo",
      messages=[{"role": "user", "content": "Tell me a joke about opentelemetry"}],
  )

  return completion.choices[0].message.content


create_joke()